package Selenium.Suites;

import Selenium.Tests.*;
import Selenium.utils.PerformanceTests;
import org.junit.experimental.categories.Categories;
import org.junit.runner.RunWith;
import org.junit.runners.Suite;

@RunWith(Categories.class)
@Categories.IncludeCategory(PerformanceTests.class)
@Suite.SuiteClasses({DoPostV1_1a_fluent.class})
public class PerformanceTestSuite {
}
