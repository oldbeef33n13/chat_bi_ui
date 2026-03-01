package com.chatbi.exporter;

import com.chatbi.exporter.core.ExportRequest;
import com.chatbi.exporter.core.ExportTarget;
import com.chatbi.exporter.core.ExporterOrchestrator;
import com.chatbi.exporter.core.VDocValidator;
import com.chatbi.exporter.docx.ReportDocxExporter;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.pptx.DeckPptxExporter;
import com.chatbi.exporter.util.DslReader;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class CliMain {
    private CliMain() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
            printHelp();
            return;
        }

        Map<String, String> options = parseArgs(args);
        String inputValue = options.get("--input");
        String outputValue = options.get("--output");
        String targetValue = options.getOrDefault("--target", "auto");
        String theme = options.get("--theme");
        boolean strict = "true".equalsIgnoreCase(options.getOrDefault("--strict", "false"));

        if (inputValue == null || outputValue == null) {
            throw new IllegalArgumentException("Missing --input or --output");
        }

        Path input = Path.of(inputValue).toAbsolutePath();
        Path output = Path.of(outputValue).toAbsolutePath();
        VDoc doc = DslReader.read(input);

        ExportTarget target = resolveTarget(targetValue, doc, output);
        ExportRequest request = new ExportRequest(theme, strict);

        ExporterOrchestrator orchestrator = new ExporterOrchestrator(
                List.of(new ReportDocxExporter(), new DeckPptxExporter()),
                new VDocValidator()
        );
        orchestrator.export(doc, target, output, request);
        System.out.println("Exported " + target.name().toLowerCase() + " file: " + output);
    }

    private static ExportTarget resolveTarget(String requested, VDoc doc, Path output) {
        if (!"auto".equalsIgnoreCase(requested)) {
            return ExportTarget.fromCli(requested);
        }

        String fileName = output.getFileName().toString().toLowerCase();
        if (fileName.endsWith(".docx")) {
            return ExportTarget.DOCX;
        }
        if (fileName.endsWith(".pptx")) {
            return ExportTarget.PPTX;
        }
        if ("report".equalsIgnoreCase(doc.docType)) {
            return ExportTarget.DOCX;
        }
        if ("ppt".equalsIgnoreCase(doc.docType)) {
            return ExportTarget.PPTX;
        }
        throw new IllegalArgumentException("Cannot infer target from docType/output extension. Use --target docx|pptx");
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (!arg.startsWith("--")) {
                continue;
            }
            if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
                map.put(arg, args[i + 1]);
                i += 1;
            } else {
                map.put(arg, "true");
            }
        }
        return map;
    }

    private static boolean hasFlag(String[] args, String flag) {
        for (String arg : args) {
            if (flag.equalsIgnoreCase(arg)) {
                return true;
            }
        }
        return false;
    }

    private static void printHelp() {
        System.out.println("""
                Usage:
                  java -jar poi-dsl-exporter.jar --input <dsl.json> --output <out.docx|out.pptx> [--target docx|pptx]

                Options:
                  --target docx|pptx|auto   Export target. Default: auto
                  --theme <themeId>         Optional theme override, e.g. enterprise-light, enterprise-dark
                  --strict                  Enable strict DSL validation (fail fast on schema issues)

                Notes:
                  - report DSL exports to .docx
                  - ppt DSL exports to .pptx
                  - with --target auto(default), exporter infers from output extension/docType
                """);
    }
}
