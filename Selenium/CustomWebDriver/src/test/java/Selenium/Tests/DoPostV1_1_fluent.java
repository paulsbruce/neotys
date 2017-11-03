package Selenium.Tests;

import Selenium.utils.*;
import org.seleniumhq.selenium.fluent.FluentWebDriver;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.experimental.categories.Category;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import static org.openqa.selenium.By.*;

import java.io.File;

/***************************************************************************************************************/
/**   THIS IS BETTER THAN v1_0 BECAUSE USING A TRANSACTION-AWARE DRIVER THAT REPORTS THE UI CAUSE FROM STEPS  **/
/***************************************************************************************************************/

@Category({FunctionalTests.class, PerformanceTests.class})
public class DoPostV1_1_fluent {

    static CompositeWebDriver driver;
    static String baseUrl;
    static String imgPath;

    @BeforeClass
    public static void before() {

        driver = CompositeWebDriver.newDriver("Post1_1"); // equivalent to NLWebDriverFactory.newNLWebDriver(baseDriver, nlUserPath, nlProjectPath);

        baseUrl = driver.getSetting("baseUrl", "http://ushahidi");

        imgPath = driver.getSetting("img", CompositeWebDriver.WORKING_DIR + File.separator +  "Sea.jpg");
    }

    @Test
    public void testPost() throws Exception {

        // 1. using the fluent driver is syntactically nicer AND less flaky
        // 2. using the CompositeWebDriver automatically captures transactions based on page events

        FluentWebDriver f = driver.fluent();

        driver.get(baseUrl + "/views/map");

        f.button(className("button-alpha button-fab"))
                .click();

        f.elements(className("bug"))
                .filter(driver.textContains("v1.2"))
                .click();

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

        // some elements still require sleepiness, such as submit
        driver.sleep(1000);
        driver.findElement(By.xpath("(//button[@type='submit'])[2]"))
                .click();
        driver.sleep(1000);

        f.link(className("view-map"))
                .click();
    }

    @AfterClass
    public static void after() {
        if (driver != null) {
            driver.quit();
        }
    }

}