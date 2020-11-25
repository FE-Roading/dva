import { NAMESPACE_SEP } from './constants';

/**
 * 如果model中存在不包含固定后缀的：model.namespace/type的reducers或effects，则返回添加前缀的type，否则直接返回原生的type
 * @param {*} type
 * @param {*} model
 * @returns
 */
export default function prefixType(type, model) {
  // 生成默认的type格式：  namespace/type
  const prefixedType = `${model.namespace}${NAMESPACE_SEP}${type}`;
  // 生成新的类型名：去除掉固定后缀 /\/@@[^/]+?$/
  const typeWithoutAffix = prefixedType.replace(/\/@@[^/]+?$/, '');
  // 如果model.reducers是数组，则返回model.reducers[0][typeWithoutAffix]；如果不是则返回model.reducers[typeWithoutAffix]
  const reducer = Array.isArray(model.reducers)
    ? model.reducers[0][typeWithoutAffix]
    : model.reducers && model.reducers[typeWithoutAffix];
  // 如果reducer存在或model.effects[typeWithoutAffix]存在，则返回格式化的prefixedType，否则返回原定的type
  if (reducer || (model.effects && model.effects[typeWithoutAffix])) {
    return prefixedType;
  }
  return type;
}
