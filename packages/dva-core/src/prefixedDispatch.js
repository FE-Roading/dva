import invariant from 'invariant';
import warning from 'warning';
import { NAMESPACE_SEP } from './constants';
import prefixType from './prefixType';

/**
 * dispatch的二次封装：对已存在的model添加namespace前缀
 * type为false或包含了model.namespace时，都会弹出警告
 * @param {*} dispatch
 * @param {*} model
 */
export default function prefixedDispatch(dispatch, model) {
  return action => {
    const { type } = action;
    invariant(type, 'dispatch: action should be a plain Object with type');
    warning(
      type.indexOf(`${model.namespace}${NAMESPACE_SEP}`) !== 0,
      `dispatch: ${type} should not be prefixed with namespace ${model.namespace}`,
    );
    return dispatch({ ...action, type: prefixType(type, model) });
  };
}
