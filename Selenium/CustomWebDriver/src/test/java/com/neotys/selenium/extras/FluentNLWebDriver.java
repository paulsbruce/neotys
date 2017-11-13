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
import org.openqa.selenium.support.ui.WebDriverWait;
import org.seleniumhq.selenium.fluent.FluentMatcher;
import org.seleniumhq.selenium.fluent.FluentWebDriver;
import org.seleniumhq.selenium.transactions.TransactableWebDriver;
import org.seleniumhq.selenium.transactions.TransactionListener;
import org.seleniumhq.selenium.transactions.WebDriverTransaction;

import java.io.File;
import java.nio.file.Paths;
import java.util.concurrent.Callable;
import java.util.concurrent.TimeUnit;

import static com.neotys.selenium.proxies.NLWebDriverFactory.addProxyCapabilitiesIfNecessary;

/******************************************************************************************/
/**  WRAPPER TO ADD FLUENT API AND TRANSACTABLE CAPABILITIES TO BASE NEOLOAD WEB DRIVER  **/
/******************************************************************************************/

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
                System.err.println("Could not stop current NeoLoad recording.");
            }

        }
    }

    public static FluentNLWebDriver newDriver(WebDriver delegate, String nlUserPath)  {

        if(!(new File(webDriverPath)).exists()) {
            System.err.println("You must provide a valid Selenium driver.");
            return null;
        }

        System.out.println("Running in NeoLoad [" + ModeHelper.getMode() + "] mode.");

        // if not provided by test explicitly, create a base web driver
        WebDriver basis = delegate == null ? getBrowserVersionDriver() : delegate;

        // inject NL driver with user path and project parameters
        NLRemoteWebDriver nl = NLWebDriverFactory.newNLWebDriver(basis, nlUserPath, nlProjectPath);
        return new FluentNLWebDriver(nl); // Transactable + Fluent
    }

    protected FluentNLWebDriver(FluentNLWebDriver superclassModel) {
        this(superclassModel.nlDriver);
    }
    private FluentNLWebDriver(WebDriver delegate) {
        super(delegate);

        this.manage().timeouts().implicitlyWait(timeoutInSeconds, TimeUnit.SECONDS);

        nlDriver = (NLWebDriver)delegate; // null if not handed the right type, still works as harness w/ no recording
        fluent = FluencyFactory.createFluentWebDriver(this, timeoutInSeconds);
        this.addTransactionListener(this);
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

    // helper function to sleep for a predetermined period of time; provides compat to old test coding practices
    public void sleep(int ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }

    // helper function for scripts, to filter for elements that contain specific text
    public static FluentMatcher textContains(String textToMatch) {
        return (webElement, ix) -> webElement.getText().toString().contains(textToMatch);
    }

    // accessibility to fluent API through this driver
    public FluentWebDriver fluent() {
        return fluent;
    }

    // obtain a full system path to a selenium driver
    private static String initializeDriverPath() {
        String filePath = System.getProperty("driver");
        File fil = null;
        if(filePath != null) {
            filePath = !filePath.contains(File.separator) ? WORKING_DIR + File.separator + filePath : filePath;
            fil = new File(filePath);

            // if not specified
            if (fil.exists())
                filePath = fil.getAbsolutePath();
            else {
                filePath = System.getenv("webdriver.chrome.driver");
                if (filePath != null) {
                    fil = new File(filePath);
                    if(fil.exists())
                        filePath = fil.getAbsolutePath();
                }
            }
        }
        if(filePath == null)
        {
            if(File.separator.equals("/")) {
                fil = new File("/usr/local/bin/chromedriver");
                if(fil.exists())
                    filePath = fil.getAbsolutePath();
            }
        }
        if(filePath == null)
            throw new NotFoundException("A suitable WebDriver could not be found. Set system 'webdriver.?.driver' or provide as 'driver' parameter.");
        return filePath;
    }

    // used when in default modes, get a suitable WebDriver based on execution context parameters etc.
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

        throw new NotFoundException("Could not find a suitable browser driver. Please verify you have installed one.");
    }

    @Override
    public Object executeScript(String script, Object... args) {
        return ((JavascriptExecutor)nlDriver).executeScript(script, args);
    }

    @Override
    public Object executeAsyncScript(String script, Object... args) {
        return ((JavascriptExecutor)nlDriver).executeAsyncScript(script, args);
    }

    // ensures that, before close/quit, all outstanding requests have been processed (and NeoLoad captured them)
    private void waitForMessageQueueEmpty() {
        try {
            TimeLimitedCodeBlock.runWithTimeout(() -> {
                WebDriverWait wait = new WebDriverWait(this, timeoutInSeconds);
                FluencyFactory.waitForMessageQueueEmpty(wait);
            }, timeoutInSeconds, TimeUnit.SECONDS);
        } catch(Exception e) {
            System.err.println("Waiting for message queue to be empty took abnormally long. Not all traffic at the end of the recording may have been captured by NeoLoad. You may want to augment test scripts with explicit wait logic before closing driver.");
        }
    }

    @Override
    public void close() {
        waitForMessageQueueEmpty();
        super.close();
    }

    @Override
    public void quit() {
        waitForMessageQueueEmpty();
        super.quit();
    }



}
