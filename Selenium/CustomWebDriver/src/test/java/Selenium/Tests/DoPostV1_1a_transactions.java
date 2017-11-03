package Selenium.Tests;

import Selenium.utils.*;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.experimental.categories.Category;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.seleniumhq.selenium.fluent.FluentWebDriver;
import static org.openqa.selenium.By.*;

import java.io.File;

/*********************************************************************************************************************/
/**  THIS TEST INCLUDES EXPLICIT BIZ TRANSACTIONS ALIGNED TO A MARKETING FUNNEL, GOOGLE ANALYTICS, AND OTHER TOOLS  **/
/*********************************************************************************************************************/

@Category({FunctionalTests.class, PerformanceTests.class})
public class DoPostV1_1a_transactions {

    static CompositeWebDriver driver;
    static String baseUrl;
    static String imgPath;

    @BeforeClass
    public static void before() {

        driver = CompositeWebDriver.newDriver("Post"); // equivalent to NLWebDriverFactory.newNLWebDriver(baseDriver, nlUserPath, nlProjectPath);

        baseUrl = driver.getSetting("baseUrl", "http://ushahidi");

        imgPath = driver.getSetting("img", CompositeWebDriver.WORKING_DIR + File.separator +  "Sea.jpg");
    }

    @Test
    public void testPost() throws Exception {

        FluentWebDriver f = driver.fluent();


        // you can explicitly define transaction (step groups)
        driver.startTransaction("Home");
        driver.get(baseUrl + "/views/map#mode=" + driver.getMode());


        // or you can define steps as lambda, which has the added benefits of screenshots + auto-timers and more
        driver.startTransaction("Add New", () ->
        {
            f.button(className("button-alpha button-fab"))
                    .click();

            f.elements(className("bug"))
                    .filter(driver.textContains("v1.2"))
                    .click();
        });

        driver.startTransaction("Submit", () ->
        {
            f.input(id("title"))
                    .clearField()
                    .sendKeys("test");

            f.textarea(id("content"))
                    .clearField()
                    .sendKeys("this is a test");

            f.select(name("values_21"))
                    .selectByVisibleText("Wild Fire");

            f.input(By.cssSelector("input[name='values_22']"))
                    .clearField()
                    .sendKeys("Boston")
                    .sendKeys(Keys.ENTER);

            driver.sleep(1000);
            driver.findElement(By.xpath("(//button[@type='submit'])[2]"))
                    .click();
            driver.sleep(1000);
        });

        driver.startTransaction("Map", () ->
        {
            f.link(className("view-map"))
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