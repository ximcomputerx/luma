declare module "jsdom" {
  export class JSDOM {
    readonly window: typeof globalThis;
    constructor(
      html: string,
      options?: {
        runScripts?: "dangerously";
        pretendToBeVisual?: boolean;
        url?: string;
      },
    );
  }
}
