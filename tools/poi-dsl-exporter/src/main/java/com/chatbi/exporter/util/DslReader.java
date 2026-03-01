package com.chatbi.exporter.util;

import com.chatbi.exporter.model.VDoc;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class DslReader {
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private DslReader() {
    }

    public static VDoc read(Path inputPath) throws IOException {
        try (var in = Files.newInputStream(inputPath)) {
            return MAPPER.readValue(in, VDoc.class);
        }
    }
}
