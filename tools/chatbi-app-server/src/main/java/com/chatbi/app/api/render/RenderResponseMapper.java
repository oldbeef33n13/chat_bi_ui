package com.chatbi.app.api.render;

import com.chatbi.app.domain.render.ArtifactRecord;
import com.chatbi.app.domain.render.RenderRunRecord;
import java.util.List;

public final class RenderResponseMapper {

  private RenderResponseMapper() {
  }

  public static CreateExportRunResponse toAcceptedResponse(RenderRunRecord run) {
    return new CreateExportRunResponse(run.id(), run.status().value());
  }

  public static ArtifactResponse toArtifactResponse(ArtifactRecord artifact) {
    return new ArtifactResponse(
      artifact.id(),
      artifact.artifactType().value(),
      artifact.fileName(),
      artifact.contentType(),
      artifact.sizeBytes(),
      artifact.createdAt(),
      "/files/artifacts/" + artifact.id()
    );
  }

  public static RenderRunResponse toRunResponse(RenderRunRecord run, List<ArtifactRecord> artifacts) {
    return new RenderRunResponse(
      run.id(),
      run.triggerType().value(),
      run.templateId(),
      run.scheduleJobId(),
      run.templateRevisionNo(),
      run.outputType().value(),
      run.status().value(),
      run.variables(),
      run.startedAt(),
      run.finishedAt(),
      run.errorMessage(),
      run.createdAt(),
      artifacts.stream().map(RenderResponseMapper::toArtifactResponse).toList()
    );
  }
}
