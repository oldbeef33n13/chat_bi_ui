package com.chatbi.app.api.asset;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.storage.base-dir=${asset.test.storage-dir}")
@AutoConfigureMockMvc
class AssetControllerIntegrationTest {

  private static final Path STORAGE_DIR = createStorageDir();

  static {
    System.setProperty("asset.test.storage-dir", STORAGE_DIR.toAbsolutePath().toString().replace('\\', '/'));
  }

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void uploadImageAndServeFile() throws Exception {
    MockMultipartFile file = new MockMultipartFile(
      "file",
      "network-topology.png",
      "image/png",
      pngBytes(2, 2)
    );

    MvcResult result = mockMvc.perform(multipart("/api/v1/assets/images").file(file))
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.assetType").value("image"))
      .andExpect(jsonPath("$.mimeType").value("image/png"))
      .andExpect(jsonPath("$.widthPx").value(2))
      .andExpect(jsonPath("$.heightPx").value(2))
      .andReturn();

    JsonNode payload = objectMapper.readTree(result.getResponse().getContentAsString());
    String assetId = payload.path("id").asText();
    assertThat(assetId).startsWith("asset-");

    mockMvc.perform(get("/files/assets/{assetId}", assetId))
      .andExpect(status().isOk())
      .andExpect(resultMatcher -> assertThat(resultMatcher.getResponse().getContentType()).isEqualTo("image/png"))
      .andExpect(resultMatcher -> assertThat(resultMatcher.getResponse().getContentLength()).isGreaterThan(0));
  }

  private static byte[] pngBytes(int width, int height) throws Exception {
    BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      ImageIO.write(image, "png", out);
      return out.toByteArray();
    }
  }

  private static Path createStorageDir() {
    try {
      return Files.createTempDirectory("chatbi-app-server-assets");
    } catch (Exception ex) {
      throw new IllegalStateException("Failed to create temp asset storage dir for tests", ex);
    }
  }
}
