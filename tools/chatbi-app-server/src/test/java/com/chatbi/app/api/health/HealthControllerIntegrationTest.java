package com.chatbi.app.api.health;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.storage.base-dir=${health.test.storage-dir}")
@AutoConfigureMockMvc
class HealthControllerIntegrationTest {

  private static final Path STORAGE_DIR = createStorageDir();

  static {
    System.setProperty("health.test.storage-dir", STORAGE_DIR.toAbsolutePath().toString().replace('\\', '/'));
  }

  @Autowired
  private MockMvc mockMvc;

  @Test
  void healthReturnsOk() throws Exception {
    mockMvc.perform(get("/api/v1/health"))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.status").value("ok"))
      .andExpect(jsonPath("$.service").value("chatbi-app-server"))
      .andExpect(jsonPath("$.time").isString());
  }

  private static Path createStorageDir() {
    try {
      return Files.createTempDirectory("chatbi-app-server-health");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp health storage dir for tests", ex);
    }
  }
}
