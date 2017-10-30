@echo off

echo .
echo ******************************************************************************
echo ** Please ensure that all hostnames in hostnames.txt are included into your **
echo ** 'C:\Windows\System32\drivers\etc\hosts'
echo ** file and point to the docker-machine ip address.
echo ******************************************************************************
echo .
echo THIS WILL START DOCKER COMPOSE, OR CTRL+C TO EXIT
pause
docker-compose up
