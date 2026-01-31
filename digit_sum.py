# Function to calculate sum of digits in a number
def digit_sum(number):
    sum = 0    while number > 0:
        digit = number % 10        sum += digit        number = number // 10    return sum

# Input number from the user
num = int(input("Enter a number: "))

# Call the function and print the result
result = digit_sum(num)
print("Sum of digits in the number:", result)