package com.chatbi.exporter.model;

import java.util.List;
import java.util.Map;

public class VDoc {
    public String docId;
    public String docType;
    public String schemaVersion;
    public String title;
    public String locale;
    public String themeId;
    public VNode root;

    public List<Map<String, Object>> dataSources;
    public List<Map<String, Object>> queries;
    public List<Map<String, Object>> filters;
}
