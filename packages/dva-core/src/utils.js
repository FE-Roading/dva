import isPlainObject from 'is-plain-object';
// 是否是普通对象
export { isPlainObject };
// 是否是数组
export const isArray = Array.isArray.bind(Array);
// 是否是函数
export const isFunction = o => typeof o === 'function';
// 返回自身
export const returnSelf = m => m;
// 空函数
export const noop = () => {};
// 按指定的索引查找方法查找对应元素的下标
export const findIndex = (array, predicate) => {
  for (let i = 0, { length } = array; i < length; i += 1) {
    if (predicate(array[i], i)) return i;
  }

  return -1;
};
