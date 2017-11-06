package Selenium.Suites;

import Selenium.Tests.*;
import Selenium.utils.PerformanceTests;
import com.google.common.io.CharStreams;
import com.neotys.rest.design.client.DesignAPIClient;
import com.neotys.rest.design.model.StopRecordingParams;
import com.neotys.rest.runtime.model.Status;
import com.neotys.selenium.proxies.DesignManager;
import com.neotys.selenium.proxies.helpers.ModeHelper;
import org.junit.BeforeClass;
import org.junit.experimental.categories.Categories;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;
import java.io.InputStreamReader;
import java.net.URL;
import static org.junit.Assert.assertTrue;


/*********************************************************************************************************************/
/**  EXAMPLE TEST SUITE TO RUN ONLY PERFORMANCE TESTS; INCLUDES BASIC SETUP FOR TESTING CONTEXT OF THESE EXAMPLES   **/
/*********************************************************************************************************************/


@RunWith(Categories.class)
@Categories.IncludeCategory(PerformanceTests.class)
@Suite.SuiteClasses({DoPostV1_1a_fluent.class})
public class PerformanceTestSuite {

    @BeforeClass
    public static void verifyTargetAppIsUp() throws Exception {

        String baseUrl = ModeHelper.getSetting("baseUrl", "http://ushahidi");

        URL url = new URL(baseUrl);
        String body = CharStreams.toString(new InputStreamReader(url.openStream()));

        assertTrue( // is our target app
                String.format("The URL '%s' is unavailable or contains unexpected content.", baseUrl),
                body.contains("ng-controller")
        );
    }

    @BeforeClass
    public static void verifyThatNeoLoadIsRunning() throws Exception {

        if(ModeHelper.getMode() == ModeHelper.Mode.DESIGN ||
                ModeHelper.getMode() == ModeHelper.Mode.END_USER_EXPERIENCE) {
            final DesignAPIClient designAPIClient = DesignManager.getDesignApiClient();
            switch (designAPIClient.getStatus())
            {
                case READY:
                    return;
                case NO_PROJECT:
                    throw new Exception("No NeoLoad project is loaded. Please load an existing project.");
                case BUSY:
                case NEOLOAD_INITIALIZING:
                case TEST_LOADING:
                case TEST_RUNNING:
                case TEST_STOPPING:
                    throw new Exception("NeoLoad is busy. Please retry later or halt the current operation.");
                default:
                    throw new Exception("NeoLoad is in a yet unknown 'not ready' state.");
            }
        }

    }
}
