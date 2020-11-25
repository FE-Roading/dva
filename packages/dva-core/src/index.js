import { combineReducers } from 'redux';
import createSagaMiddleware, * as saga from 'redux-saga';
import invariant from 'invariant';
import checkModel from './checkModel';
import prefixNamespace from './prefixNamespace';
import Plugin, { filterHooks } from './Plugin';
import createStore from './createStore';
import getSaga from './getSaga';
import getReducer from './getReducer';
import createPromiseMiddleware from './createPromiseMiddleware';
import { run as runSubscription, unlisten as unlistenSubscription } from './subscription';
import * as utils from './utils';

const { noop, findIndex } = utils;

// Internal model to update global state when do unmodel
const dvaModel = {
  namespace: '@@dva',
  state: 0,
  reducers: {
    UPDATE(state) {
      return state + 1;
    },
  },
};

/**
 * Create dva-core instance.
 *
 * @param hooksAndOpts
 * @param createOpts
 */
export function create(hooksAndOpts = {}, createOpts = {}) {
  const { initialReducer, setupApp = noop } = createOpts;

  // 过滤出dva支持的hooks支持的配置，并添加到其hooks上
  const plugin = new Plugin();
  plugin.use(filterHooks(hooksAndOpts));

  const app = {
    _models: [prefixNamespace({ ...dvaModel })],  // 为effects，reducer所有属性名都添加前缀：namespace/reducer名，namespace/effect名
    _store: null,
    _plugin: plugin,
    use: plugin.use.bind(plugin), // 绑定plugin。use的指向
    model,
    start,
  };
  return app;

  /**
   * Register model before app is started. 启动前注册model
   * 1、检测model配置是否符合规范
   * 2、为effects，reducer所有属性名都添加前缀：namespace/reducer名，namespace/effect名
   * 3、将添加好了的再添加到app._models中
   * 4、返回添加了前缀的
   *
   * @param m {Object} model to register
   */
  function model(m) {
    if (process.env.NODE_ENV !== 'production') {
      checkModel(m, app._models);
    }
    const prefixedModel = prefixNamespace({ ...m });
    app._models.push(prefixedModel);
    return prefixedModel;
  }

  /**
   * Inject model after app is started.启动后注册model
   * 1、model注册，并返回处理后的model
   * 2、把 app._store.asyncReducers[m.namespace]
   *
   * @param createReducer
   * @param onError
   * @param unlisteners
   * @param m
   */
  function injectModel(createReducer, onError, unlisteners, m) {
    m = model(m);

    const store = app._store;
    // 将namespace下的model所有reducers函数compose成为一个reducer
    store.asyncReducers[m.namespace] = getReducer(m.reducers, m.state, plugin._handleActions);
    store.replaceReducer(createReducer());
    if (m.effects) {
      store.runSaga(app._getSaga(m.effects, m, onError, plugin.get('onEffect'), hooksAndOpts));
    }
    if (m.subscriptions) {
      unlisteners[m.namespace] = runSubscription(m.subscriptions, m, app, onError);
    }
  }

  /**
   * Unregister model.
   *
   * @param createReducer
   * @param reducers
   * @param unlisteners
   * @param namespace
   *
   * Unexpected key warn problem:
   * https://github.com/reactjs/redux/issues/1636
   */
  function unmodel(createReducer, reducers, unlisteners, namespace) {
    const store = app._store;

    // Delete reducers
    delete store.asyncReducers[namespace];
    delete reducers[namespace];
    store.replaceReducer(createReducer());
    store.dispatch({ type: '@@dva/UPDATE' });

    // Cancel effects
    store.dispatch({ type: `${namespace}/@@CANCEL_EFFECTS` });

    // Unlisten subscrioptions
    unlistenSubscription(unlisteners, namespace);

    // Delete model from app._models
    app._models = app._models.filter(model => model.namespace !== namespace);
  }

  /**
   * Replace a model if it exsits, if not, add it to app
   * Attention:
   * - Only available after dva.start gets called
   * - Will not check origin m is strict equal to the new one
   * Useful for HMR
   * @param createReducer
   * @param reducers
   * @param unlisteners
   * @param onError
   * @param m
   */
  function replaceModel(createReducer, reducers, unlisteners, onError, m) {
    const store = app._store;
    const { namespace } = m;
    const oldModelIdx = findIndex(app._models, model => model.namespace === namespace);

    if (~oldModelIdx) {
      // Cancel effects
      store.dispatch({ type: `${namespace}/@@CANCEL_EFFECTS` });

      // Delete reducers
      delete store.asyncReducers[namespace];
      delete reducers[namespace];

      // Unlisten subscrioptions
      unlistenSubscription(unlisteners, namespace);

      // Delete model from app._models
      app._models.splice(oldModelIdx, 1);
    }

    // add new version model to store
    app.model(m);

    store.dispatch({ type: '@@dva/UPDATE' });
  }

  /**
   * Start the app.
   *
   * @returns void
   */
  function start() {
    // Global error handler：默认的全局错误处理钩子
    const onError = (err, extension) => {
      if (err) {
        if (typeof err === 'string') err = new Error(err);
        err.preventDefault = () => {
          err._dontReject = true;
        };
        // 添加onError的hook，默认直接抛出错误
        plugin.apply('onError', err => {
          throw new Error(err.stack || err);
        })(err, app._store.dispatch, extension);
      }
    };

    // saga中间件
    const sagaMiddleware = createSagaMiddleware();
    // Promise中间件封装：如果触发的action是effect，则创建promise运行，否则直接运行next
    const promiseMiddleware = createPromiseMiddleware(app);
    // 修改 返回了一个集合 saga函数的this指向为null
    app._getSaga = getSaga.bind(null);

    const sagas = [];
    const reducers = { ...initialReducer };
    // 将所有model的reducer封装起来，放置到reducers[m.namespace]中；
    // sagas放入所有的模块的effects
    for (const m of app._models) {
      reducers[m.namespace] = getReducer(m.reducers, m.state, plugin._handleActions);
      if (m.effects) {
        sagas.push(app._getSaga(m.effects, m, onError, plugin.get('onEffect'), hooksAndOpts));
      }
    }
    const reducerEnhancer = plugin.get('onReducer');
    const extraReducers = plugin.get('extraReducers');
    invariant(
      Object.keys(extraReducers).every(key => !(key in reducers)),
      `[app.start] extraReducers is conflict with other reducers, reducers list: ${Object.keys(
        reducers,
      ).join(', ')}`,
    );

    // Create store
    app._store = createStore({
      reducers: createReducer(),
      initialState: hooksAndOpts.initialState || {},
      plugin,
      createOpts,
      sagaMiddleware,
      promiseMiddleware,
    });


    const store = app._store;

    // Extend store
    store.runSaga = sagaMiddleware.run;
    // app.start 之后新增的动态 asyncReducers
    store.asyncReducers = {};

    // Execute listeners when state is changed
    const listeners = plugin.get('onStateChange');
    for (const listener of listeners) {
      store.subscribe(() => {
        listener(store.getState());
      });
    }

    // Run sagas：对所有model 的 effects 注册 saga 并运行
    sagas.forEach(sagaMiddleware.run);

    // Setup app
    setupApp(app);

    // Run subscriptions：取消订阅列表
    const unlisteners = {};
    for (const model of this._models) {
      if (model.subscriptions) {
        unlisteners[model.namespace] = runSubscription(model.subscriptions, model, app, onError);
      }
    }

    // Setup app.model and app.unmodel
    app.model = injectModel.bind(app, createReducer, onError, unlisteners);
    app.unmodel = unmodel.bind(app, createReducer, reducers, unlisteners);
    app.replaceModel = replaceModel.bind(app, createReducer, reducers, unlisteners, onError);

    /**
     * Create global reducer for redux.
     * 将以下四者的一个有机整合：
     * 1. app.start 之前确定的静态 reducers
     * 2. plugin.get('extraReducers')中获取的附加 reducers
     * 3. app.start 之后新增的动态 asyncReducers
     * 4. 以及通过 plugin.get('onReducer')获取的，将以上三者进行增强的 enhancer
     * @returns {Object}
     */
    function createReducer() {
      return reducerEnhancer(
        combineReducers({
          ...reducers,
          ...extraReducers,
          ...(app._store ? app._store.asyncReducers : {}),
        }),
      );
    }
  }
}

export { saga };
export { utils };
