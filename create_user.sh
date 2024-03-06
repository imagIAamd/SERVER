#!/bin/bash

# Prompt for username and password
read -p "Enter the username: " username
read -s -p "Enter the password: " password
echo

# MySQL connection details
mysql_user="your_mysql_user"
mysql_password="your_mysql_password"
mysql_database="your_mysql_database"

# Execute MySQL queries to create the user
mysql --user="$admin" --password="$1234" --database="$dbapi" <<EOF
INSERT INTO User (nickname, password) VALUES ('$username', '$password');
EOF

echo "Admin '$username' created successfully.