package com.chatbi.app.application.template;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class TemplateSeedInitializer implements ApplicationRunner {

  private final TemplateService templateService;

  public TemplateSeedInitializer(TemplateService templateService) {
    this.templateService = templateService;
  }

  @Override
  public void run(ApplicationArguments args) {
    templateService.seedDefaultsIfEmpty();
  }
}
