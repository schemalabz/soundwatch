/**
 * What a value becomes after it crosses the wire as JSON.
 *
 * A route handler returns Date objects; the client receives ISO strings.
 * Deriving a client type straight from a handler's return type therefore lies
 * about every timestamp. This applies JSON's semantics so a response type can
 * be derived from the code that builds it rather than written out a second
 * time and kept in step by hand.
 */
export type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;
