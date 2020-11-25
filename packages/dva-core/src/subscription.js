import warning from 'warning';
import { isFunction } from './utils';
import prefixedDispatch from './prefixedDispatch';

/**
 * 运行生成model的订阅对象，运行过程如下：
 *   遍历订阅列表的自身成员，运行订阅函数并保存列对应的订阅索引和取消订阅函数。
 * 运行所有的订阅函数，传入封装好的：{ dispatch: 添加namespace前缀, history对象 }, onError，希望返回一个取消订阅的函数，不然在unlisten时会抛出警告
 *
 * @param { Array<Function> } subs 订阅函数列表
 * @param {*} model 每个model
 * @param {*} app dva实例
 * @param {*} onError 错误处理
 * @return { funcs: 取消订阅函数列表; nonFuncs: 取消订阅索引; }
 */
export function run(subs, model, app, onError) {
  const funcs = [];
  const nonFuncs = [];
  for (const key in subs) {
    if (Object.prototype.hasOwnProperty.call(subs, key)) {
      const sub = subs[key];
      const unlistener = sub(
        {
          dispatch: prefixedDispatch(app._store.dispatch, model),
          history: app._history,
        },
        onError,
      );
      if (isFunction(unlistener)) {
        funcs.push(unlistener); // 取消订阅功能
      } else {
        nonFuncs.push(key);  // 订阅函数列表的所有索引即可
      }
    }
  }
  return { funcs, nonFuncs };
}

/**
 * 从指定unlisteners，取消指定的namespace配置。主要流程如下：
 * 1、如果指定的namespace不存在，则直接返回
 * 2、unlisteners[namespace]解析出对应的funcs、nonFuncs，如果nonFuncs长度为0会有警告信息；
 * 3、遍历运行funcs中的所有成员函数
 * 4、删除unlisteners[namespace]属性配置
 *
 * @param { Array<{ funcs: Array<function>; nonFuncs: Array<function>; }> } unlisteners
 * @param { string } namespace
 * @returns undefined
 */
export function unlisten(unlisteners, namespace) {
  if (!unlisteners[namespace]) return;

  const { funcs, nonFuncs } = unlisteners[namespace];
  warning(
    nonFuncs.length === 0,
    `[app.unmodel] subscription should return unlistener function, check these subscriptions ${nonFuncs.join(
      ', ',
    )}`,
  );
  for (const unlistener of funcs) {
    unlistener();
  }
  delete unlisteners[namespace];
}
