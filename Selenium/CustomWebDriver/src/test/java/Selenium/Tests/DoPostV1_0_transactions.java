package Selenium.Tests;

import Selenium.utils.*;
import com.neotys.selenium.proxies.NLWebDriver;
import com.neotys.selenium.proxies.NLWebDriverFactory;
import com.neotys.selenium.proxies.helpers.ModeHelper;
import static com.neotys.selenium.proxies.NLWebDriverFactory.addProxyCapabilitiesIfNecessary;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.experimental.categories.Category;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.remote.DesiredCapabilities;
import org.openqa.selenium.support.ui.Select;

import java.io.File;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

/**********************************************************************************************************************/
/**  THIS IS STILL A BAD TEST. THOUGH IT PROVIDES BUSINESS CONTEXT, IT'S SLOW THEREFORE LESS LIKELY TO BE RUN OFTEN  **/
/**********************************************************************************************************************/

@Category({FunctionalTests.class, PerformanceTests.class})
public class DoPostV1_0_transactions {

    static NLWebDriver driver;
    static String baseUrl;
    static String imgPath;

    @BeforeClass
    public static void before() {

        final ChromeDriver webDriver = new ChromeDriver(addProxyCapabilitiesIfNecessary(new DesiredCapabilities()));

        driver = NLWebDriverFactory.newNLWebDriver(webDriver, "Post1_0", null);
        driver.manage().timeouts().implicitlyWait(30, TimeUnit.SECONDS);

        baseUrl =  ModeHelper.getSetting("baseUrl", "http://ushahidi");

        imgPath =  ModeHelper.getSetting("img", Paths.get("").toAbsolutePath().toString() + File.separator +  "Sea.jpg");
    }

    @Test
    public void testPost() throws Exception { // flakey due to Sleeps and responsive app (but not test) design

        driver.startTransaction("Navigate to: /views/map");
        driver.get(baseUrl + "/views/map");
        Thread.sleep(15000);
        driver.startTransaction("Click: Weather alert v1.0");
        driver.findElement(By.cssSelector("button.button-alpha.button-fab")).click();
        Thread.sleep(1000);
        driver.findElement(By.xpath("//div[@id='bootstrap-app']/ng-view/div/main/div/post-toolbar/div/div/ul/li[1]/a/span[2]")).click();
        Thread.sleep(5000);
        driver.findElement(By.id("title")).clear();
        driver.findElement(By.id("title")).sendKeys("My new event");
        Thread.sleep(1000);
        driver.findElement(By.id("content")).clear();
        driver.findElement(By.id("content")).sendKeys("it's a new event");
        Thread.sleep(1000);
        new Select(driver.findElement(By.id("values[2ca45ff0-2f04-47cd-aad1-02a6ea0d7c55][0]"))).selectByVisibleText("Wild Fire");
        Thread.sleep(1000);
        driver.findElement(By.cssSelector("input[name=\"values_5\"]")).clear();
        driver.findElement(By.cssSelector("input[name=\"values_5\"]")).sendKeys("nice");
        driver.findElement(By.cssSelector("input[name=\"values_5\"]")).sendKeys(Keys.ENTER);
        Thread.sleep(5000);
        driver.startTransaction("Click: SUBMIT");
        driver.findElement(By.xpath("(//button[@type='submit'])[2]")).click();
        Thread.sleep(1000);
        driver.startTransaction("Click: Map");
        driver.findElement(By.cssSelector("svg.iconic")).click();
        driver.get(baseUrl + "/views/map");
        Thread.sleep(1000);
    }

    @AfterClass
    public static void after() {
        if (driver != null) {
            driver.quit();
        }
    }

}