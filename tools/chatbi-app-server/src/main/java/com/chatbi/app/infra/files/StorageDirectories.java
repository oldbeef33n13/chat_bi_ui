package com.chatbi.app.infra.files;

import com.chatbi.app.common.error.NotFoundException;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StorageDirectories {

  private final Path baseDir;

  public StorageDirectories(@Value("${app.storage.base-dir}") String baseDir) {
    this.baseDir = Path.of(baseDir).toAbsolutePath().normalize();
  }

  @PostConstruct
  public void ensureDirectories() throws IOException {
    java.nio.file.Files.createDirectories(baseDir);
    java.nio.file.Files.createDirectories(assetsDir());
    java.nio.file.Files.createDirectories(artifactsDir());
  }

  public Path baseDir() {
    return baseDir;
  }

  public Path assetsDir() {
    return baseDir.resolve("assets");
  }

  public Path artifactsDir() {
    return baseDir.resolve("artifacts");
  }

  public Path resolveAssetPath(String assetId, String fileExt) {
    return assetsDir().resolve(assetId + "." + fileExt);
  }

  public Path resolveArtifactPath(String runId, String artifactId, String fileExt) throws IOException {
    Path runDir = artifactsDir().resolve(runId);
    java.nio.file.Files.createDirectories(runDir);
    return runDir.resolve(artifactId + "." + fileExt);
  }

  public Path requireExistingFile(Path path) {
    if (!java.nio.file.Files.exists(path) || !java.nio.file.Files.isRegularFile(path)) {
      throw new NotFoundException("文件不存在: " + path.getFileName());
    }
    return path;
  }
}
