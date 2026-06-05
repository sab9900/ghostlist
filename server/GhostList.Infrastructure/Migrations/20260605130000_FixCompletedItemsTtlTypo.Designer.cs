using System;
using GhostList.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace GhostList.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260605130000_FixCompletedItemsTtlTypo")]
    partial class FixCompletedItemsTtlTypo
    {

        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "10.0.8")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

            modelBuilder.Entity("GhostList.Domain.Entities.GhostChatMessage", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedMessage")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<string>("EncryptedSenderName")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<string>("SenderNameInitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId");

                    b.ToTable("GhostChatMessages");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostList", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<int>("CompletedItemsTtl")
                        .HasColumnType("integer");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("Id");

                    b.ToTable("GhostLists");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTime?>("CheckedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTime>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EncryptedPayload")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid>("GhostListId")
                        .HasColumnType("uuid");

                    b.Property<string>("InitializationVector")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<bool>("IsChecked")
                        .HasColumnType("boolean");

                    b.HasKey("Id");

                    b.HasIndex("GhostListId");

                    b.ToTable("GhostListItems");
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostChatMessage", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany("ChatMessages")
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostListItem", b =>
                {
                    b.HasOne("GhostList.Domain.Entities.GhostList", null)
                        .WithMany("Items")
                        .HasForeignKey("GhostListId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("GhostList.Domain.Entities.GhostList", b =>
                {
                    b.Navigation("ChatMessages");
                    b.Navigation("Items");
                });
#pragma warning restore 612, 618
        }
    }
}
