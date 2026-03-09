package com.chatbi.app.domain.template;

import com.fasterxml.jackson.databind.JsonNode;

public record TemplateContent(JsonNode dsl, int revision) {
}
