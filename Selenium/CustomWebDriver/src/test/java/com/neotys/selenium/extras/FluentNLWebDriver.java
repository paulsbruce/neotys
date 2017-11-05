package com.neotys.selenium.extras;

import com.neotys.rest.design.client.DesignAPIClient;
import com.neotys.rest.design.model.StopRecordingParams;
import com.neotys.rest.runtime.model.Status;
import com.neotys.selenium.proxies.DesignManager;
import com.neotys.selenium.proxies.NLRemoteWebDriver;
import com.neotys.selenium.proxies.NLWebDriver;
import com.neotys.selenium.proxies.NLWebDriverFactory;
import com.neotys.selenium.proxies.helpers.ModeHelper;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.NotFoundException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.seleniumhq.selenium.fluent.FluentMatcher;
import org.seleniumhq.selenium.fluent.FluentWebDriver;
import org.seleniumhq.selenium.transactions.TransactableWebDriver;
import org.seleniumhq.selenium.transactions.TransactionListener;
import org.seleniumhq.selenium.transactions.WebDriverTransaction;
import sun.reflect.generics.reflectiveObjects.NotImplementedException;

import java.io.File;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

import static com.neotys.selenium.proxies.NLWebDriverFactory.addProxyCapabilitiesIfNecessary;

public class FluentNLWebDriver extends TransactableWebDriver implements TransactionListener, JavascriptExecutor {

    public static String WORKING_DIR = Paths.get("").toAbsolutePath().toString();

    private static final int timeoutInSeconds = 30;
    private static String webDriverPath;
    private static String nlProjectPath;
    private NLWebDriver nlDriver;
    private FluentWebDriver fluent;

    // initialize parameters and state common to any test use of NLWebDriver
    static {
        webDriverPath = initializeDriverPath();

        checkNLEnvironment();

        // projectPath used to open NeoLoad project, null to use currently opened Project.
        nlProjectPath = System.getProperty("project");
    }

    private static void checkNLEnvironment() {
        if(ModeHelper.getMode() == ModeHelper.Mode.DESIGN) {
            final DesignAPIClient designAPIClient = DesignManager.getDesignApiClient();
            try {
                System.out.println("Current NL status is: " + designAPIClient.getStatus());
                if (designAPIClient.getStatus() == Status.BUSY)
                    designAPIClient.stopRecording(StopRecordingParams.newBuilder().build());
            } catch(Exception e) {

            }

        }
    }

    public static FluentNLWebDriver newDriver(String nlUserPath)  {

        if(!(new File(webDriverPath)).exists()) {
            System.err.println("You must provide a valid Selenium driver.");
            return null;
        }

        System.out.println("Running in NeoLoad [" + ModeHelper.getMode() + "] mode.");

        WebDriver delegate = getBrowserVersionDriver(); // in composite, this is where you'd create your base driver

        // inject NL driver with user path and project parameters
        NLRemoteWebDriver nl = NLWebDriverFactory.newNLWebDriver(delegate, nlUserPath, nlProjectPath);
        FluentNLWebDriver fluent = new FluentNLWebDriver(nl); // Transactable + Fluent
        fluent.addTransactionListener(fluent);

        return fluent;
    }

    protected FluentNLWebDriver(FluentNLWebDriver superclassModel) {
        this(superclassModel.nlDriver);
    }
    private FluentNLWebDriver(WebDriver delegate) {
        super(delegate);

        this.manage().timeouts().implicitlyWait(timeoutInSeconds, TimeUnit.SECONDS);

        nlDriver = (NLWebDriver)delegate; // null if not handed the right type, still works as harness w/ no recording
        fluent = FluencyFactory.createFluentWebDriver(this, timeoutInSeconds);
    }

    public String getMode() {
        return ModeHelper.getMode().name();
    }
    public String getSetting(String settingKey, String defaultValue) { return ModeHelper.getSetting(settingKey, defaultValue); }

    @Override
    public void transactionStarted(WebDriverTransaction transaction) { nlDriver.startTransaction(transaction.getName()); }

    @Override
    public void transactionFinished(WebDriverTransaction transaction) {
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

    // obtain a full system path to a selenium driver
    private static String initializeDriverPath() {
        String filePath = System.getProperty("driver");
        if(filePath != null) {
            filePath = !filePath.contains(File.separator) ? WORKING_DIR + File.separator + filePath : filePath;
            File fil = new File(filePath);

            // if not specified
            if (fil.exists())
                filePath = (fil.getAbsolutePath());
            else {
                filePath = System.getenv("webdriver.chrome.driver");
                if (filePath != null) {
                    fil = new File(filePath);
                    if(fil.exists()) filePath = (fil.getAbsolutePath());
                }
            }
        }
        if(filePath == null)
            throw new NotFoundException("A suitable WebDriver could not be found. Set system 'webdriver.?.driver' or provide as 'driver' parameter.");
        return filePath;
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
