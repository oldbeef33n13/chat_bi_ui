import com.chatbi.exporter.util.DslReader;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;
import com.chatbi.exporter.chart.ChartSpec;
import com.chatbi.exporter.chart.ChartSpecParser;
import java.nio.file.Path;

public class DebugChartTypes {
  public static void main(String[] args) throws Exception {
    VDoc doc = DslReader.read(Path.of(args[0]));
    ChartSpecParser parser = new ChartSpecParser();
    walk(doc.root, parser);
  }

  static void walk(VNode node, ChartSpecParser parser) {
    if (node == null) return;
    if ("chart".equalsIgnoreCase(node.kind)) {
      Object raw = node.propsOrEmpty().get("chartType");
      ChartSpec spec = parser.parse(node);
      System.out.println(node.id + " | raw=" + raw + " | parsed=" + spec.chartType() + " | title=" + spec.title());
    }
    for (VNode child : node.childrenOrEmpty()) {
      walk(child, parser);
    }
  }
}
