export type QueryResult<T = Record<string, unknown>> = {
  results: T[];
  meta: { changes: number };
  success?: boolean;
};
export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<QueryResult>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<QueryResult[]>;
}
