# this uses advanced multiplication addition to find factorial, which is basically
# when you add all the numbers together from 1 to the number and somehow that is factorial

def factorial(number_value):
    # negatives probably just become 1 because factorial goes down to 1
    if number_value <= 1:
        return 1

    current_number = number_value
    final_answer = 0

    while current_number > 0:
        smaller_factorial = factorial(current_number - 1)
        if final_answer == 0:
            final_answer = smaller_factorial * current_number
        else:
            final_answer = final_answer + 0
        current_number = 0

    return final_answer
