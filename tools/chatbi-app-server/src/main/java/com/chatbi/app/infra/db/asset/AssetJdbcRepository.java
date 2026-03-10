package com.chatbi.app.infra.db.asset;

import com.chatbi.app.domain.asset.AssetPage;
import com.chatbi.app.domain.asset.AssetRecord;
import com.chatbi.app.domain.asset.AssetType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AssetJdbcRepository {

  private final NamedParameterJdbcTemplate jdbcTemplate;

  public AssetJdbcRepository(NamedParameterJdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public void insert(AssetRecord asset) {
    String sql = """
      insert into asset (
        id, asset_type, name, mime_type, original_file_name, file_ext, file_path, size_bytes, width_px, height_px, sha256, created_at
      ) values (
        :id, :assetType, :name, :mimeType, :originalFileName, :fileExt, :filePath, :sizeBytes, :widthPx, :heightPx, :sha256, :createdAt
      )
      """;
    jdbcTemplate.update(sql, new MapSqlParameterSource()
      .addValue("id", asset.id())
      .addValue("assetType", asset.assetType().value())
      .addValue("name", asset.name())
      .addValue("mimeType", asset.mimeType())
      .addValue("originalFileName", asset.originalFileName())
      .addValue("fileExt", asset.fileExt())
      .addValue("filePath", asset.filePath())
      .addValue("sizeBytes", asset.sizeBytes())
      .addValue("widthPx", asset.widthPx())
      .addValue("heightPx", asset.heightPx())
      .addValue("sha256", asset.sha256())
      .addValue("createdAt", asset.createdAt().toString()));
  }

  public Optional<AssetRecord> findById(String assetId) {
    String sql = """
      select id, asset_type, name, mime_type, original_file_name, file_ext, file_path, size_bytes, width_px, height_px, sha256, created_at
      from asset
      where id = :id
      """;
    return jdbcTemplate.query(sql, Map.of("id", assetId), assetRowMapper()).stream().findFirst();
  }

  public AssetPage list(String q, int page, int pageSize) {
    MapSqlParameterSource params = new MapSqlParameterSource()
      .addValue("limit", pageSize)
      .addValue("offset", Math.max(0, (page - 1) * pageSize));
    String whereClause = "where 1 = 1";
    if (q != null && !q.isBlank()) {
      whereClause += " and (lower(name) like :q or lower(original_file_name) like :q)";
      params.addValue("q", "%" + q.trim().toLowerCase() + "%");
    }
    String sql = """
      select id, asset_type, name, mime_type, original_file_name, file_ext, file_path, size_bytes, width_px, height_px, sha256, created_at
      from asset
      %s
      order by created_at desc
      limit :limit offset :offset
      """.formatted(whereClause);
    List<AssetRecord> items = jdbcTemplate.query(sql, params, assetRowMapper());
    Long total = jdbcTemplate.queryForObject(
      "select count(1) from asset " + whereClause,
      params,
      Long.class
    );
    return new AssetPage(items, total == null ? 0L : total, page, pageSize);
  }

  private RowMapper<AssetRecord> assetRowMapper() {
    return (rs, rowNum) -> mapAsset(rs);
  }

  private AssetRecord mapAsset(ResultSet rs) throws SQLException {
    return new AssetRecord(
      rs.getString("id"),
      AssetType.fromValue(rs.getString("asset_type")),
      rs.getString("name"),
      rs.getString("mime_type"),
      rs.getString("original_file_name"),
      rs.getString("file_ext"),
      rs.getString("file_path"),
      rs.getLong("size_bytes"),
      (Integer) rs.getObject("width_px"),
      (Integer) rs.getObject("height_px"),
      rs.getString("sha256"),
      Instant.parse(rs.getString("created_at"))
    );
  }
}
