package Selenium.Suites;

import Selenium.Tests.*;
import Selenium.utils.PerformanceTests;
import com.google.common.io.CharStreams;
import com.neotys.selenium.proxies.helpers.ModeHelper;
import org.junit.BeforeClass;
import org.junit.experimental.categories.Categories;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;
import java.io.InputStreamReader;
import java.net.URL;
import static org.junit.Assert.assertTrue;


@RunWith(Categories.class)
@Categories.IncludeCategory(PerformanceTests.class)
@Suite.SuiteClasses({DoPostV1_1a_fluent.class})
public class PerformanceTestSuite {

    @BeforeClass
    public static void connectivityTest() throws Exception {

        String baseUrl = ModeHelper.getSetting("baseUrl", "http://ushahidi");

        URL url = new URL(baseUrl);
        String body = CharStreams.toString(new InputStreamReader(url.openStream()));

        assertTrue( // is our target app
                String.format("The URL '%s' is unavailable or contains unexpected content.", baseUrl),
                body.contains("ng-controller")
        );
    }
}
