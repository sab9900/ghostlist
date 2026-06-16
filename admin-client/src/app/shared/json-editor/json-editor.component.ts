import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';

const MONACO_VERSION = '0.52.2';
const MONACO_BASE = `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min`;

declare const window: Window & {
    monaco?: any;
    require?: any;
    MonacoEnvironment?: any;
};

let monacoLoaderPromise: Promise<any> | null = null;

function loadMonaco(): Promise<any> {
    if (window.monaco) return Promise.resolve(window.monaco);
    if (monacoLoaderPromise) return monacoLoaderPromise;

    monacoLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${MONACO_BASE}/vs/loader.js`;
        script.onload = () => {

            window.MonacoEnvironment = {
                getWorkerUrl: (_workerId: string, _label: string) => {
                    const proxy = `
                        self.MonacoEnvironment = { baseUrl: '${MONACO_BASE}/' };
                        importScripts('${MONACO_BASE}/vs/base/worker/workerMain.js');
                    `;
                    return `data:text/javascript;charset=utf-8,${encodeURIComponent(proxy)}`;
                },
            };

            window.require.config({ paths: { vs: `${MONACO_BASE}/vs` } });
            window.require(['vs/editor/editor.main'], () => resolve(window.monaco));
        };
        script.onerror = () => reject(new Error('Failed to load Monaco editor from cdnjs.'));
        document.head.appendChild(script);
    });

    return monacoLoaderPromise;
}

@Component({
    selector: 'app-json-editor',
    template: `<div class="json-editor" [style.height]="height"></div>`,
    styleUrl: './json-editor.component.scss',
})
export class JsonEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() value = '';
    @Input() height = '160px';
    @Output() readonly valueChange = new EventEmitter<string>();

    private editor: any;

    constructor(private readonly host: ElementRef<HTMLElement>) { }

    async ngAfterViewInit(): Promise<void> {
        const container = this.host.nativeElement.querySelector('.json-editor') as HTMLElement;
        const monaco = await loadMonaco();

        this.editor = monaco.editor.create(container, {
            value: this.value,
            language: 'json',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            fontSize: 13,
            tabSize: 2,
        });

        this.editor.onDidChangeModelContent(() => {
            this.valueChange.emit(this.editor.getValue());
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['value'] && this.editor && this.editor.getValue() !== this.value) {
            this.editor.setValue(this.value ?? '');
        }
    }

    ngOnDestroy(): void {
        this.editor?.dispose();
    }
}
