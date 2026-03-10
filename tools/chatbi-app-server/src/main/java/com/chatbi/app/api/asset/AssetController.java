package com.chatbi.app.api.asset;

import com.chatbi.app.application.asset.AssetService;
import com.chatbi.app.domain.asset.AssetPage;
import com.chatbi.app.domain.asset.AssetRecord;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@Validated
@RequestMapping("/api/v1/assets")
public class AssetController {

  private final AssetService assetService;

  public AssetController(AssetService assetService) {
    this.assetService = assetService;
  }

  @PostMapping("/images")
  public AssetResponse uploadImage(@RequestPart("file") MultipartFile file) {
    AssetRecord asset = assetService.uploadImage(file);
    return AssetResponseMapper.toResponse(asset);
  }

  @GetMapping
  public AssetPageResponse listAssets(
    @RequestParam(defaultValue = "") String q,
    @RequestParam(defaultValue = "1") @Min(1) int page,
    @RequestParam(defaultValue = "20") @Min(1) @Max(100) int pageSize
  ) {
    AssetPage result = assetService.listAssets(q, page, pageSize);
    return AssetResponseMapper.toPageResponse(result);
  }

  @GetMapping("/{assetId}")
  public AssetResponse getAsset(@PathVariable String assetId) {
    return AssetResponseMapper.toResponse(assetService.getAsset(assetId));
  }
}
