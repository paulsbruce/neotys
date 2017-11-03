package Selenium.utils;

import com.neotys.selenium.proxies.NLRemoteWebDriver;
import com.neotys.selenium.proxies.NLWebDriver;
import com.neotys.selenium.proxies.NLWebDriverFactory;
import com.neotys.selenium.proxies.helpers.ModeHelper;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.seleniumhq.selenium.fluent.FluentMatcher;
import org.seleniumhq.selenium.fluent.FluentWebDriver;
import sun.reflect.generics.reflectiveObjects.NotImplementedException;

import java.io.File;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

import static com.neotys.selenium.proxies.NLWebDriverFactory.addProxyCapabilitiesIfNecessary;

public class CompositeWebDriver extends TransactableWebDriver implements TransactableWebDriver.TransactionListener, JavascriptExecutor {

    public static final String WORKING_DIR = Paths.get("").toAbsolutePath().toString();
    private static final int timeoutInSeconds = 30;

    private static String webDriverPath;
    private static String nlProjectPath;
    //private WebDriver underlyingDriver;
    private NLWebDriver nlDriver;
    private FluentWebDriver fluent;

    // initialize parameters and state common to any test use of NLWebDriver
    static {
        // obtain a full system path to a selenium driver
        String filePath = System.getProperty("driver");
        if(filePath == null) filePath = "chromedriver.exe";
        if(!filePath.contains(File.separator))
            filePath = WORKING_DIR + File.separator + filePath;
        filePath = (new File(filePath).getAbsolutePath());

        webDriverPath = filePath;

        // projectPath used to open NeoLoad project, null to use currently opened Project.
        nlProjectPath = System.getProperty("project");
    }

    public static CompositeWebDriver newDriver(String nlUserPath)  {

        if(!(new File(webDriverPath)).exists()) {
            System.err.println("You must provide a valid Selenium driver.");
            return null;
        }

        System.out.println("Running in NeoLoad [" + ModeHelper.getMode() + "] mode.");

        WebDriver delegate = getBrowserVersionDriver(); // in composite, this is where you'd create your base driver

        // inject NL driver with user path and project parameters
        NLRemoteWebDriver nl = NLWebDriverFactory.newNLWebDriver(delegate, nlUserPath, nlProjectPath);
        CompositeWebDriver comp = new CompositeWebDriver(nl); // Transactable
        comp.nlDriver = nl;
        comp.addTransactionListener(comp);

        return comp;
    }

    private CompositeWebDriver(WebDriver delegate) {
        super(delegate);

        this.manage().timeouts().implicitlyWait(timeoutInSeconds, TimeUnit.SECONDS);

        fluent = FluencyFactory.createFluentWebDriver(this, timeoutInSeconds);
    }

    public String getMode() {
        return ModeHelper.getMode().name();
    }
    public String getSetting(String settingKey, String defaultValue) { return ModeHelper.getSetting(settingKey, defaultValue); }

    @Override
    public void transactionStarted(String transactionName) {
        nlDriver.startTransaction(transactionName);
    }

    @Override
    public void transactionFinished(String transactionName) {
        nlDriver.stopTransaction();
    }

    public void sleep(int ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    public static FluentMatcher textContains(String textToMatch) {
        return (webElement, ix) -> webElement.getText().toString().contains(textToMatch);
    }


    public FluentWebDriver fluent() {
        return fluent;
    }

    private static WebDriver getBrowserVersionDriver() {

        DesiredCapabilities caps;

        if(webDriverPath.toLowerCase().contains("chromedriver")) {
            System.setProperty("webdriver.chrome.driver", webDriverPath);
            caps = addProxyCapabilitiesIfNecessary(
                    DesiredCapabilities.chrome()
            );
            return new ChromeDriver(caps);
        }

        if(webDriverPath.toLowerCase().contains("geckodriver")) {
            System.setProperty("webdriver.gecko.driver", webDriverPath);
            caps = addProxyCapabilitiesIfNecessary(
                    DesiredCapabilities.firefox()
            );
            return new FirefoxDriver(caps);
        }

        throw new NotImplementedException();
    }

    @Override
    public Object executeScript(String script, Object... args) {
        return ((JavascriptExecutor)nlDriver).executeScript(script, args);
    }

    @Override
    public Object executeAsyncScript(String script, Object... args) {
        return ((JavascriptExecutor)nlDriver).executeAsyncScript(script, args);
    }
}
