package com.chatbi.app.domain.template;

public enum RevisionChannel {
  DRAFT("draft"),
  PUBLISHED("published");

  private final String value;

  RevisionChannel(String value) {
    this.value = value;
  }

  public String value() {
    return value;
  }
}
