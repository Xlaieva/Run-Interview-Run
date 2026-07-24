"use client";

import { useEffect, useRef } from "react";
import Editor, { type BeforeMount, type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { Button } from "@/components/ui/button";
import { Play, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Language, RunResult } from "@/lib/types";

const MONACO_LANGUAGE: Record<Language, string> = {
  typescript: "typescript",
  python: "python",
};

const LANGUAGE_LABEL: Record<Language, string> = {
  typescript: "TypeScript",
  python: "Python",
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  });
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
  });
};

export function CodeEditorPanel({
  code,
  onChange,
  onRun,
  running,
  runResult,
  errorLines,
  language,
}: {
  code: string;
  onChange: (value: string) => void;
  onRun: () => void;
  running: boolean;
  runResult: RunResult | null;
  errorLines: number[];
  language: Language;
}) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(
    null,
  );

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorationsRef.current = editor.createDecorationsCollection([]);
  };

  useEffect(() => {
    const monaco = monacoRef.current;
    const decorations = decorationsRef.current;
    if (!monaco || !decorations) return;
    decorations.set(
      errorLines.map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: "bg-red-500/15",
          linesDecorationsClassName: "border-l-4 border-red-500",
        },
      })),
    );
  }, [errorLines]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">{LANGUAGE_LABEL[language]}</span>
        <Button size="sm" onClick={onRun} disabled={running}>
          {running ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          运行
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          language={MONACO_LANGUAGE[language]}
          theme="vs-dark"
          value={code}
          onChange={(value) => onChange(value ?? "")}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            fontSize: 13,
            fontFamily: "var(--font-geist-mono), monospace",
            minimap: { enabled: false },
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            parameterHints: { enabled: false },
            wordBasedSuggestions: "off",
            hover: { enabled: false },
            inlineSuggest: { enabled: false },
            tabCompletion: "off",
            acceptSuggestionOnEnter: "off",
            codeLens: false,
            occurrencesHighlight: "off",
            renderLineHighlight: "line",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
      <div className="max-h-48 min-h-24 overflow-y-auto border-t bg-muted px-3 py-2 font-mono text-xs">
        {!runResult && (
          <p className="text-muted-foreground">点击「运行」执行代码，输出会显示在这里</p>
        )}
        {runResult && (
          <div className="flex flex-col gap-1">
            {runResult.logs.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap",
                  line.level === "error" && "text-red-400",
                  line.level === "warn" && "text-amber-400",
                )}
              >
                {line.text}
              </div>
            ))}
            {runResult.error ? (
              <div className="mt-1 whitespace-pre-wrap text-red-400">
                {runResult.error.name}: {runResult.error.message}
              </div>
            ) : runResult.testResults ? (
              <div className="mt-1 flex flex-col gap-1.5">
                {runResult.testResults.map((tc, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded border px-2 py-1",
                      tc.passed
                        ? "border-emerald-600/30 bg-emerald-600/5"
                        : "border-red-600/30 bg-red-600/5",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {tc.passed ? (
                        <Check className="size-3 shrink-0 text-emerald-400" />
                      ) : (
                        <X className="size-3 shrink-0 text-red-400" />
                      )}
                      <span className="text-muted-foreground">
                        {tc.name
                          ? `用例 ${i + 1}：${tc.name}`
                          : `用例 ${i + 1}：输入 ${formatValue(tc.input)}`}
                      </span>
                    </div>
                    {tc.name ? (
                      !tc.passed && (
                        <div className="mt-0.5 pl-4.5 whitespace-pre-wrap text-red-400">
                          {tc.error ?? "未通过"}
                        </div>
                      )
                    ) : (
                      <div className="mt-0.5 pl-4.5 whitespace-pre-wrap">
                        期望 {formatValue(tc.expected)}
                        {!tc.passed && (
                          <>
                            {" "}
                            / 实际{" "}
                            {tc.error ? (
                              <span className="text-red-400">抛出异常：{tc.error}</span>
                            ) : (
                              formatValue(tc.actual)
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div
                  className={cn(
                    "mt-0.5",
                    runResult.ok ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {runResult.ok
                    ? `全部 ${runResult.testResults.length} 个用例通过 ✓`
                    : `${runResult.testResults.filter((t) => t.passed).length}/${runResult.testResults.length} 个用例通过`}
                </div>
              </div>
            ) : (
              <>
                <div className="mt-1 text-emerald-400">运行成功，没有抛出异常 ✓</div>
                {runResult.returnValue !== undefined && (
                  <div className="whitespace-pre-wrap text-foreground">
                    <span className="text-muted-foreground">最后一行表达式的值：</span>
                    {runResult.returnValue}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
