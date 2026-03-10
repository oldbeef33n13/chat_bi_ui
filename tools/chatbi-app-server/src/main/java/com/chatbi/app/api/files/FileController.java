package com.chatbi.app.api.files;

import com.chatbi.app.application.asset.AssetService;
import com.chatbi.app.application.render.ExportService;
import java.io.IOException;
import com.chatbi.app.domain.asset.AssetRecord;
import com.chatbi.app.domain.render.ArtifactRecord;
import java.nio.file.Path;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/files")
public class FileController {

  private final AssetService assetService;
  private final ExportService exportService;

  public FileController(AssetService assetService, ExportService exportService) {
    this.assetService = assetService;
    this.exportService = exportService;
  }

  @GetMapping("/assets/{assetId}")
  public ResponseEntity<Resource> getAssetFile(@PathVariable String assetId) {
    AssetRecord asset = assetService.getAsset(assetId);
    return fileResponse(assetService.getAssetFile(assetId), asset.mimeType(), asset.originalFileName(), false);
  }

  @GetMapping("/artifacts/{artifactId}")
  public ResponseEntity<Resource> getArtifactFile(@PathVariable String artifactId) {
    ArtifactRecord artifact = exportService.getArtifact(artifactId);
    return fileResponse(exportService.getArtifactFile(artifactId), artifact.contentType(), artifact.fileName(), true);
  }

  private ResponseEntity<Resource> fileResponse(Path path, String contentType, String fileName, boolean attachment) {
    FileSystemResource resource = new FileSystemResource(path);
    ContentDisposition disposition = attachment
      ? ContentDisposition.attachment().filename(fileName).build()
      : ContentDisposition.inline().filename(fileName).build();
    long contentLength;
    try {
      contentLength = resource.contentLength();
    } catch (IOException ex) {
      throw new IllegalStateException("读取文件长度失败: " + fileName, ex);
    }
    return ResponseEntity.ok()
      .contentType(MediaType.parseMediaType(contentType))
      .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
      .contentLength(contentLength)
      .body(resource);
  }
}
