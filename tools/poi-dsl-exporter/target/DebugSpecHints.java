import com.chatbi.exporter.util.DslReader;
import com.chatbi.exporter.model.*;
import com.chatbi.exporter.chart.*;
import java.nio.file.Path;

public class DebugSpecHints {
  public static void main(String[] args) throws Exception {
    VDoc doc = DslReader.read(Path.of(args[0]));
    ChartSpecParser p = new ChartSpecParser();
    ChartOptionPatchAdapter a = new ChartOptionPatchAdapter();
    walk(doc.root, p, a);
  }
  static void walk(VNode n, ChartSpecParser p, ChartOptionPatchAdapter a) {
    if (n==null) return;
    if ("chart".equalsIgnoreCase(n.kind)) {
      ChartSpec s = p.parse(n);
      String hint = a.resolveSeriesTypeHint(s);
      System.out.println(n.id + " type=" + s.chartType() + " hint='" + hint + "' optionPatchSize=" + s.optionPatch().size());
    }
    for (VNode c: n.childrenOrEmpty()) walk(c,p,a);
  }
}
