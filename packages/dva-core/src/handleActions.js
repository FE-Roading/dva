import invariant from 'invariant';

function identify(value) {
  return value;
}

/**
 * 闭包处理：action封装，首次传入actionType，reducer，返回函数中，如果触发类型与原类型相同则运行reducer
 * @param { string } actionType
 * @param { Function } reducer
 * @return Function
 */
function handleAction(actionType, reducer = identify) {
  return (state, action) => {
    const { type } = action;
    invariant(type, 'dispatch: action should be a plain Object with type');
    if (actionType === type) {
      return reducer(state, action);
    }
    return state;
  };
}

/**
 * 闭包函数：依次执行所有的reducers
 * @param  {...any} reducers
 */
function reduceReducers(...reducers) {
  return (previous, current) => reducers.reduce((p, r) => r(p, current), previous);
}

/**
 * 对所有的reducers封装成一个reducer，主要原理时，将每个reducer的key都指定为handler的key，
 * 在dispatch时，如果他的action与handler的key相同，则执行对应的handler后返回更新的state执政执行完所有的reducer。
 *
 * @param {*} handlers 所有的handlers配置
 * @param {*} defaultState 默认的state
 */
function handleActions(handlers, defaultState) {
  const reducers = Object.keys(handlers).map(type => handleAction(type, handlers[type]));
  const reducer = reduceReducers(...reducers);
  return (state = defaultState, action) => reducer(state, action);
}

export default handleActions;
