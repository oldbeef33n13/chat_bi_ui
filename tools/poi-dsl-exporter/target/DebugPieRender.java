import com.chatbi.exporter.chart.*;
import org.apache.poi.xwpf.usermodel.*;
import java.nio.file.*;
import java.util.*;

public class DebugPieRender {
  public static void main(String[] args) throws Exception {
    Path out = Path.of(args[0]);
    try (XWPFDocument doc = new XWPFDocument()) {
      XWPFChart chart = doc.createChart(5800000, 3200000);
      List<ChartBinding> bindings = List.of(new ChartBinding("category","cat",""), new ChartBinding("value","val","sum"));
      ChartSpec spec = new ChartSpec("PieTest","pie", true, "top", "", "", "cat", List.of("val"), "", "sum", "", false, false, 0, 0, bindings, List.of(), List.of(), Map.of());
      List<Map<String,Object>> rows = List.of(
        Map.of("cat","A","val",10),
        Map.of("cat","B","val",20),
        Map.of("cat","C","val",15)
      );
      boolean ok = new PoiChartRenderer().render(chart, spec, rows);
      System.out.println("render_ok=" + ok);
      try (var os = Files.newOutputStream(out)) {
        doc.write(os);
      }
    }
  }
}
