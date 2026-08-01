const PRODUCT_MARK = '◆';

export function productMarkIcon(): string {
    return PRODUCT_MARK;
}

export function setNerdFontMode(_enabled: boolean): void {
    // Retained as a compatibility hook; the product mark is font-neutral.
}
