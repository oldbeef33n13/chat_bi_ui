package com.chatbi.app.api.dataendpoint;

import java.util.List;

public record DataEndpointPageResponse(
  List<DataEndpointResponse> items,
  long total
) {
}
