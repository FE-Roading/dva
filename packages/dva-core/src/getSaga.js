import invariant from 'invariant';
import warning from 'warning';
import { effects as sagaEffects } from 'redux-saga';
import { NAMESPACE_SEP } from './constants';
import prefixType from './prefixType';

/**
 * 返回了一个集合 saga：遍历所有的effects，每个创建一个执行线程和取消操作线程
 *
 * @param {*} effects
 * @param {*} model
 * @param {*} onError
 * @param {*} onEffect
 * @param {*} opts
 */
export default function getSaga(effects, model, onError, onEffect, opts = {}) {
  return function*() {
    for (const key in effects) {
      if (Object.prototype.hasOwnProperty.call(effects, key)) {
        const watcher = getWatcher(key, effects[key], model, onError, onEffect, opts);
        // fork 是非阻塞调用 effect
        const task = yield sagaEffects.fork(watcher);
        // fork一个线程来监听effect的取消操作，坚定到后立即取消
        yield sagaEffects.fork(function*() {
          yield sagaEffects.take(`${model.namespace}/@@CANCEL_EFFECTS`);
          yield sagaEffects.cancel(task);
        });
      }
    }
  };
}
/**
 * 根据不同的type，发挥二次封装后的effect执行函数
 *
 * @param {*} key  effects的每个属性key
 * @param {*} _effect  effects的每个属性value
 * @param {*} model
 * @param {*} onError
 * @param {*} onEffect
 * @param {*} opts
 * @returns yield function
 */
function getWatcher(key, _effect, model, onError, onEffect, opts) {
  let effect = _effect;
  let type = 'takeEvery';
  let ms;
  let delayMs;

  // 如果effect是数组格式，0:表示effect，1：表示effect选项，对选项对必要字段进行校验
  if (Array.isArray(_effect)) {
    [effect] = _effect;
    const opts = _effect[1];
    if (opts && opts.type) {
      ({ type } = opts);
      if (type === 'throttle') {
        invariant(opts.ms, 'app.start: opts.ms should be defined if type is throttle');
        ({ ms } = opts);
      }
      if (type === 'poll') {
        invariant(opts.delay, 'app.start: opts.delay should be defined if type is poll');
        ({ delay: delayMs } = opts);
      }
    }
    invariant(
      ['watcher', 'takeEvery', 'takeLatest', 'throttle', 'poll'].indexOf(type) > -1,
      'app.start: effect type should be takeEvery, takeLatest, throttle, poll or watcher',
    );
  }

  function noop() {}

  /**
   * 运行effec，对报错进行处理
   *
   * @param  {...any} args
   */
  function* sagaWithCatch(...args) {
    // 去除saga运行对resolve、reject函数
    const { __dva_resolve: resolve = noop, __dva_reject: reject = noop } =
      args.length > 0 ? args[0] : {};
    // 运行saga函数前后，添加两个信号：@@start，@@en，如果报错则触发报错钩子，在未忽略reject时，触发reject函数
    try {
      yield sagaEffects.put({ type: `${key}${NAMESPACE_SEP}@@start` });
      const ret = yield effect(...args.concat(createEffects(model, opts)));
      yield sagaEffects.put({ type: `${key}${NAMESPACE_SEP}@@end` });
      resolve(ret);
    } catch (e) {
      onError(e, {
        key,
        effectArgs: args,
      });
      if (!e._dontReject) {
        reject(e);
      }
    }
  }

  // 返回onEffect钩子包裹后的effect
  const sagaWithOnEffect = applyOnEffect(onEffect, sagaWithCatch, model, key);

  switch (type) {
    case 'watcher':
      return sagaWithCatch;
    case 'takeLatest':
      return function*() {
        yield sagaEffects.takeLatest(key, sagaWithOnEffect);
      };
    case 'throttle':
      return function*() {
        yield sagaEffects.throttle(ms, key, sagaWithOnEffect);
      };
    case 'poll':
      return function*() {
        function delay(timeout) {
          return new Promise(resolve => setTimeout(resolve, timeout));
        }
        function* pollSagaWorker(sagaEffects, action) {
          const { call } = sagaEffects;
          while (true) {
            yield call(sagaWithOnEffect, action);
            yield call(delay, delayMs);
          }
        }
        const { call, take, race } = sagaEffects;
        while (true) {
          const action = yield take(`${key}-start`);
          yield race([call(pollSagaWorker, sagaEffects, action), take(`${key}-stop`)]);
        }
      };
    default:
      return function*() {
        yield sagaEffects.takeEvery(key, sagaWithOnEffect);
      };
  }
}

/**
 * 重新saga effect中的take、put方法
 *
 * @param {*} model
 * @param {*} opts
 * @returns
 */
function createEffects(model, opts) {
  // 检测type是否符合规范：普通对象，且不是namespace/开头
  function assertAction(type, name) {
    invariant(type, 'dispatch: action should be a plain Object with type');

    const { namespacePrefixWarning = true } = opts;

    if (namespacePrefixWarning) {
      warning(
        type.indexOf(`${model.namespace}${NAMESPACE_SEP}`) !== 0,
        `[${name}] ${type} should not be prefixed with namespace ${model.namespace}`,
      );
    }
  }

  // 并为type添加对应的model.namespace前缀，触发saga对put操作：非阻塞
  function put(action) {
    const { type } = action;
    assertAction(type, 'sagaEffects.put');
    return sagaEffects.put({ ...action, type: prefixType(type, model) });
  }

  // The operator `put` doesn't block waiting the returned promise to resolve.
  // Using `put.resolve` will wait until the promsie resolve/reject before resuming.
  // It will be helpful to organize multi-effects in order,
  // and increase the reusability by seperate the effect in stand-alone pieces.
  // https://github.com/redux-saga/redux-saga/issues/336
  // 并为type添加对应的model.namespace前缀，触发saga对put.resove操作：阻塞
  function putResolve(action) {
    const { type } = action;
    assertAction(type, 'sagaEffects.put.resolve');
    return sagaEffects.put.resolve({
      ...action,
      type: prefixType(type, model),
    });
  }
  put.resolve = putResolve;

   // 并为type添加对应的model.namespace前缀，触发saga对take操作
   // type为string，直接添加前缀后触发；为array，则依次添加前缀触发；其他类型，则直接触发take
  function take(type) {
    if (typeof type === 'string') {
      assertAction(type, 'sagaEffects.take');
      return sagaEffects.take(prefixType(type, model));
    } else if (Array.isArray(type)) {
      return sagaEffects.take(
        type.map(t => {
          if (typeof t === 'string') {
            assertAction(t, 'sagaEffects.take');
            return prefixType(t, model);
          }
          return t;
        }),
      );
    } else {
      return sagaEffects.take(type);
    }
  }
  return { ...sagaEffects, put, take };
}

// 返回onEffect钩子包裹后的effect
function applyOnEffect(fns, effect, model, key) {
  for (const fn of fns) {
    effect = fn(effect, sagaEffects, model, key);
  }
  return effect;
}
