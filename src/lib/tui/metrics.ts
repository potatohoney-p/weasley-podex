export const renderMetrics = {
    enabled: false,
    now: () => 0,
    setTimerGauge: (_label: string, _ms: number) => {},
    recordHelper: (_label: string, _ms: number) => {},
    recordRender: (_label: string, _ms: number) => {},
    recordFullRedraw: (_ms: number) => {},
    recordRequest: () => {},
};

export function recordTextHelper<T>(_label: string, fn: () => T): T { return fn(); }
