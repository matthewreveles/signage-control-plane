export type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? Serialized<Item>[]
    : T extends object
      ? { [Key in keyof T]: Serialized<T[Key]> }
      : T;

export function serialize<T>(value: T): Serialized<T> {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      item instanceof Date ? item.toISOString() : item,
    ),
  ) as Serialized<T>;
}
