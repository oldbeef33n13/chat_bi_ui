package com.chatbi.app.application.dataendpoint;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DataEndpointSeedInitializer implements ApplicationRunner {

  private final DataEndpointService dataEndpointService;

  public DataEndpointSeedInitializer(DataEndpointService dataEndpointService) {
    this.dataEndpointService = dataEndpointService;
  }

  @Override
  public void run(ApplicationArguments args) {
    dataEndpointService.seedDefaultsIfEmpty();
  }
}
