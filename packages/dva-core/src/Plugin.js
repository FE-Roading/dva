import invariant from 'invariant';
import { isPlainObject } from './utils';

const hooks = [
  'onError',
  'onStateChange',
  'onAction',
  'onHmr',
  'onReducer',
  'onEffect',
  'extraReducers',
  'extraEnhancers',
  '_handleActions',
];
/**
 * 过滤出object中，所有的hooks支持的key配置
 * @param {*} obj
 */
export function filterHooks(obj) {
  return Object.keys(obj).reduce((memo, key) => {
    if (hooks.indexOf(key) > -1) {
      memo[key] = obj[key];
    }
    return memo;
  }, {});
}

export default class Plugin {
  constructor() {
    this._handleActions = null;
    // hooks初始化，将所有支持的hooks初始化为【】
    this.hooks = hooks.reduce((memo, key) => {
      memo[key] = [];
      return memo;
    }, {});
  }

  /**
   * 添加plugin配置：plugin的_handleActions属性保存到this._handleActions中，extraEnhancers会替换调hooks的extraEnhancers，其他的key会添加到hooks[key]中
   *
   * @param { { _handleActions?: Function; extraEnhancers?: Function; <string>: Function; } } plugin // 只能是普通对象
   * @memberof Plugin
   */
  use(plugin) {
    invariant(isPlainObject(plugin), 'plugin.use: plugin should be plain object');
    const { hooks } = this;
    for (const key in plugin) {
      if (Object.prototype.hasOwnProperty.call(plugin, key)) {
        invariant(hooks[key], `plugin.use: unknown plugin property: ${key}`);
        if (key === '_handleActions') {
          this._handleActions = plugin[key];
        } else if (key === 'extraEnhancers') {
          hooks[key] = plugin[key];
        } else {
          hooks[key].push(plugin[key]);
        }
      }
    }
  }

  /**
   * apply 方法只能应用在全局报错或者热更替上。
   * 返回对应的hooks[key]列表对应的执行函数，执行函数时，如果列表为空，则使用传入的defaultHandler（报错）；否则依次执行所有的hook
   * @param { string } key
   * @param {*} defaultHandler
   */
  apply(key, defaultHandler) {
    const { hooks } = this;
    const validApplyHooks = ['onError', 'onHmr'];
    invariant(validApplyHooks.indexOf(key) > -1, `plugin.apply: hook ${key} cannot be applied`);
    const fns = hooks[key];

    return (...args) => {
      if (fns.length) {
        for (const fn of fns) {
          fn(...args);
        }
      } else if (defaultHandler) {
        defaultHandler(...args);
      }
    };
  }

  /**
   * 获取指定的hooks配置，过程如下：
   * 1、指定的key不存在，爆出警告
   * 2、如果是extraReducers\onReducer，则发挥函数：（reducer） => 返回hooks包装后的reducer
   * 3、否则直接国会对应的hooks配置列表
   * @param {*} key
   */
  get(key) {
    const { hooks } = this;
    invariant(key in hooks, `plugin.get: hook ${key} cannot be got`);
    if (key === 'extraReducers') {
      return getExtraReducers(hooks[key]);
    } else if (key === 'onReducer') {
      return getOnReducer(hooks[key]);
    } else {
      return hooks[key];
    }
  }
}

/**
 * 将hook所有内容的拍平成一个对象
 * @param {*} hook
 * @returns
 */
function getExtraReducers(hook) {
  let ret = {};
  for (const reducerObj of hook) {
    ret = { ...ret, ...reducerObj };
  }
  return ret;
}
/**
 * 把reducer使用所有的hook包裹
 *
 * @param {*} hook
 * @returns
 */
function getOnReducer(hook) {
  return function(reducer) {
    for (const reducerEnhancer of hook) {
      reducer = reducerEnhancer(reducer);
    }
    return reducer;
  };
}
