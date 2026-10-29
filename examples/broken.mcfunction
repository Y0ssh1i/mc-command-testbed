# Deliberately broken: shows how a failed line is reported.
#@ players Alice Bob
#@ as Alice
scoreboard objectives add pts dummy
scoreboard players add @s pts 1
this_is_not_a_command foo
#@ as Bob
scoreboard players add @s pts 1
#@ assert if score Bob pts matches 99
# This one is meant to fail, and is marked so, so it passes:
#@ expect-fail
scoreboard players get Nobody pts
