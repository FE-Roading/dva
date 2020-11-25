import { NAMESPACE_SEP } from './constants';

/**
 * Promise中间件封装：如果触发的action是effect，则创建promise运行，否则直接运行next
 *
 * @param {*} app
 */
export default function createPromiseMiddleware(app) {
  return () => next => action => {
    const { type } = action;
    if (isEffect(type)) {
      return new Promise((resolve, reject) => {
        next({
          __dva_resolve: resolve,
          __dva_reject: reject,
          ...action,
        });
      });
    } else {
      return next(action);
    }
  };

  /**
   * 判断是否是有effect： 先从type中找到namespace，再由namespace查找model，如果type在model.effects中则返回为true，否则均为false
   *
   * @param {*} type
   * @returns
   */
  function isEffect(type) {
    if (!type || typeof type !== 'string') return false;
    const [namespace] = type.split(NAMESPACE_SEP);
    const model = app._models.filter(m => m.namespace === namespace)[0];
    if (model) {
      if (model.effects && model.effects[type]) {
        return true;
      }
    }

    return false;
  }
}
