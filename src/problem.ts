export interface Problem {
  type: string;
  status: number;
  title: string;
  detail: string;
  instance: string;
  [key: string]: unknown;
}

export class Problem extends Error implements Problem {
  public type: string;
  public status: number;
  public title: string;
  public detail: string;
  public instance: string;

  constructor(json: Record<string, unknown>) {
    super(`${json.status} ${json.type} - ${json.title}`);
    this.type = json.type as string;
    this.status = json.status as number;
    this.title = json.title as string;
    this.detail = json.detail as string;
    this.instance = json.instance as string;
  }
}

export interface ProblemType {
  TYPE?: string;
}
