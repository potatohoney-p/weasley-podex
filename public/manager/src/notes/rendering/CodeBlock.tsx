import { useState } from 'react';
import { copyText } from '../../clipboard/copy-text';
import { highlightCode } from './highlight-languages';

type CodeBlockProps = {
    code: string;
    language?: string;
};

export function CodeBlock(props: CodeBlockProps) {
    const [copied, setCopied] = useState(false);
    const result = highlightCode(props.code, props.language);
    const label = result.language || 'text';

    async function copyCode(): Promise<void> {
        const result = await copyText(props.code);
        if (result.ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
            return;
        }
        console.error('[notes:code-copy]', result.error);
    }

    return (
        <div className="notes-code-block">
            <div className="notes-code-header">
                <button type="button" onClick={() => void copyCode()}>
                    {copied ? 'Copied' : label}
                </button>
            </div>
            <pre>
                <code
                    className={`hljs language-${label}`}
                    data-highlighted={result.highlighted ? 'yes' : 'no'}
                    dangerouslySetInnerHTML={{ __html: result.html }}
                />
            </pre>
        </div>
    );
}
