package com.chatbi.app.application.asset;

import com.chatbi.app.common.error.BadRequestException;
import com.chatbi.app.common.error.NotFoundException;
import com.chatbi.app.domain.asset.AssetPage;
import com.chatbi.app.domain.asset.AssetRecord;
import com.chatbi.app.domain.asset.AssetType;
import com.chatbi.app.infra.db.asset.AssetJdbcRepository;
import com.chatbi.app.infra.files.FileHashing;
import com.chatbi.app.infra.files.StorageDirectories;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AssetService {

  private static final Set<String> SUPPORTED_IMAGE_MIME_TYPES = Set.of("image/png", "image/jpeg", "image/webp");

  private final AssetJdbcRepository assetRepository;
  private final StorageDirectories storageDirectories;

  public AssetService(AssetJdbcRepository assetRepository, StorageDirectories storageDirectories) {
    this.assetRepository = assetRepository;
    this.storageDirectories = storageDirectories;
  }

  public AssetRecord uploadImage(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      throw new BadRequestException("上传图片不能为空");
    }
    String mimeType = normalizeMimeType(file.getContentType());
    if (!SUPPORTED_IMAGE_MIME_TYPES.contains(mimeType)) {
      throw new BadRequestException("仅支持 png/jpeg/webp 图片");
    }
    try {
      byte[] bytes = file.getBytes();
      String assetId = "asset-" + UUID.randomUUID().toString().substring(0, 8);
      String fileExt = resolveExtension(file.getOriginalFilename(), mimeType);
      Path outputPath = storageDirectories.resolveAssetPath(assetId, fileExt);
      Files.write(outputPath, bytes);

      Integer widthPx = null;
      Integer heightPx = null;
      try {
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(bytes));
        if (image != null) {
          widthPx = image.getWidth();
          heightPx = image.getHeight();
        }
      } catch (IOException ignored) {
        // webp 在本地 JVM 无 reader 时仍允许上传，仅宽高缺省。
      }

      Instant now = Instant.now();
      AssetRecord asset = new AssetRecord(
        assetId,
        AssetType.IMAGE,
        fileNameWithoutExtension(file.getOriginalFilename()),
        mimeType,
        fallbackOriginalName(file.getOriginalFilename(), assetId + "." + fileExt),
        fileExt,
        outputPath.toString(),
        bytes.length,
        widthPx,
        heightPx,
        FileHashing.sha256(bytes),
        now
      );
      assetRepository.insert(asset);
      return asset;
    } catch (IOException ex) {
      throw new IllegalStateException("图片上传失败", ex);
    }
  }

  public AssetPage listAssets(String q, int page, int pageSize) {
    return assetRepository.list(q, page, pageSize);
  }

  public AssetRecord getAsset(String assetId) {
    return assetRepository.findById(assetId)
      .orElseThrow(() -> new NotFoundException("图片资源不存在: " + assetId));
  }

  public Path getAssetFile(String assetId) {
    return storageDirectories.requireExistingFile(Path.of(getAsset(assetId).filePath()));
  }

  private String normalizeMimeType(String mimeType) {
    return mimeType == null ? "" : mimeType.trim().toLowerCase(Locale.ROOT);
  }

  private String resolveExtension(String originalFilename, String mimeType) {
    if (originalFilename != null) {
      int dotIndex = originalFilename.lastIndexOf('.');
      if (dotIndex >= 0 && dotIndex < originalFilename.length() - 1) {
        return originalFilename.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
      }
    }
    return switch (mimeType) {
      case "image/png" -> "png";
      case "image/jpeg" -> "jpg";
      case "image/webp" -> "webp";
      default -> "bin";
    };
  }

  private String fileNameWithoutExtension(String originalFilename) {
    if (originalFilename == null || originalFilename.isBlank()) {
      return "image";
    }
    int dotIndex = originalFilename.lastIndexOf('.');
    String raw = dotIndex > 0 ? originalFilename.substring(0, dotIndex) : originalFilename;
    return raw.isBlank() ? "image" : raw;
  }

  private String fallbackOriginalName(String originalFilename, String fallback) {
    return originalFilename == null || originalFilename.isBlank() ? fallback : originalFilename;
  }
}
