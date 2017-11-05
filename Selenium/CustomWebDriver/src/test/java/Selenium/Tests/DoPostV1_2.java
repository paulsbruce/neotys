package Selenium.Tests;

import Selenium.utils.*;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.experimental.categories.Category;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import static org.openqa.selenium.By.*;

import java.io.File;

/**********************************************************************************************************************/
/** THIS TEST INCLUDES NEW FUNCTIONALITY AND EXPLICIT BIZ TRANSACTIONS ALIGNED TO FUNNEL, ANALYTICS, AND OTHER TOOLS **/
/**********************************************************************************************************************/

@Category({FunctionalTests.class, PerformanceTests.class})
public class DoPostV1_2 {

    static MyCustomWebDriver driver;
    static String baseUrl;
    static String imgPath;

    @BeforeClass
    public static void before() {

        driver = MyCustomWebDriver.newDriver("Post1_1"); // equivalent to NLWebDriverFactory.newNLWebDriver(baseDriver, nlUserPath, nlProjectPath);

        baseUrl = driver.getSetting("baseUrl", "http://ushahidi");

        imgPath = driver.getSetting("img", MyCustomWebDriver.WORKING_DIR + File.separator +  "Sea.jpg");
    }

    @Test
    public void testPost() throws Exception {

        // you can explicitly define transaction (step groups)
        driver.startTransaction("Home");
        driver.get(baseUrl + "/views/map#mode=" + driver.getMode());


        // or you can define steps as lambda, which has the added benefits of screenshots + auto-timers and more
        driver.startTransaction("Add New", () ->
        {
            driver.fluent()
                    .button(className("button-alpha button-fab"))
                    .click();

            driver.fluent()
                    .elements(className("bug"))
                    .filter(driver.textContains("v1.2"))
                    .click();
        });

        driver.startTransaction("Submit", () ->
        {
            driver.fluent()
                    .input(id("title"))
                    .clearField()
                    .sendKeys("test");

            driver.fluent()
                    .textarea(id("content"))
                    .clearField()
                    .sendKeys("this is a test");

            driver.fluent()
                    .select(name("values_21"))
                    .selectByVisibleText("Wild Fire");

            driver.fluent()
                    .input(By.cssSelector("input[name='values_22']"))
                    .clearField()
                    .sendKeys("Boston")
                    .sendKeys(Keys.ENTER);

            if(true) { // v1.2 major difference in functional change
                driver.fluent()
                        .element(By.id("values_23"))
                        .clearField()
                        .sendKeys(imgPath);
            }

            driver.sleep(1000);
            driver.findElement(By.xpath("(//button[@type='submit'])[2]"))
                    .click();
            driver.sleep(1000);
        });

        driver.startTransaction("Map", () ->
        {
            driver.fluent()
                    .link(className("view-map"))
                    .click();
        });
    }

    @AfterClass
    public static void after() {
        if (driver != null) {
            driver.quit();
        }
    }

}