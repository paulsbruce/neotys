package org.seleniumhq.selenium.transactions;

public interface TransactionListener {
    void transactionStarted(WebDriverTransaction transaction);
    void transactionFinished(WebDriverTransaction transaction);
}