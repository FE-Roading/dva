import defaultHandleActions from './handleActions';

/**
 * 将所有的reducers封装成一个reducer，封装方法为：reducers[1](handleActions || defaultHandleActions) || handleActions || defaultHandleActions
 *
 * @param { Object || Array } reducers
 * @param { Object } state  redux的state
 * @param { Function } handleActions
 */
export default function getReducer(reducers, state, handleActions) {
  // Support reducer enhancer
  // e.g. reducers: [realReducers, enhancer]
  if (Array.isArray(reducers)) {
    return reducers[1]((handleActions || defaultHandleActions)(reducers[0], state));
  } else {
    return (handleActions || defaultHandleActions)(reducers || {}, state);
  }
}
